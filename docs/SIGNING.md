# Code signing and releases

Unsigned builds are blocked on both platforms ("Keyframe.app is damaged" on macOS, SmartScreen / Defender on
Windows 11). The release workflow (`.github/workflows/release.yml`) signs the apps as soon as the secrets below exist.
Until then it produces the same unsigned builds as a local `npm run dist`.

| Platform | What you buy | Used for |
|---|---|---|
| macOS | Apple Developer Program membership (yearly) | Developer ID Application certificate + notarization |
| Windows | Azure Trusted Signing, Basic plan (monthly) | Authenticode signature, SmartScreen reputation |

Microsoft now calls Trusted Signing **Artifact Signing**; the portal and the role names may show either name. Its
current steps are at <https://learn.microsoft.com/azure/artifact-signing/quickstart>. Portal labels on both sides
change often, so treat the click paths below as a guide.

## 1. macOS: Developer ID certificate

1. Enrol at <https://developer.apple.com/programs/enroll/> (as the company if you want the company name shown).
2. On a Mac: **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**. Enter
   your email, choose **Saved to disk**. This creates a `.certSigningRequest` file and a private key in your keychain.
3. At <https://developer.apple.com/account/resources/certificates/add> choose **Developer ID Application** (not
   "Installer", not "Apple Distribution"), upload the request file, and download the `.cer`. Only the **Account
   Holder** can create this type.
4. Double-click the `.cer` so it joins its private key in the **login** keychain.
5. In Keychain Access → **My Certificates**, expand "Developer ID Application: NAME (TEAMID)", select the certificate
   **and** its private key, right-click → **Export 2 items…** → `.p12`. Set a strong password.
6. Base64 it for GitHub: `base64 -i DeveloperID.p12 | pbcopy`

| GitHub secret | Value |
|---|---|
| `CSC_LINK` | the base64 text from step 6 |
| `CSC_KEY_PASSWORD` | the `.p12` password |

## 2. macOS: App Store Connect API key (notarization)

1. <https://appstoreconnect.apple.com/access/integrations/api> → **Team Keys** → **+**. Name "Keyframe notarization",
   access **Developer**.
2. Download `AuthKey_XXXXXXXXXX.p8` (one download only). Note the **Key ID** and the **Issuer ID** shown above the list.

| GitHub secret | Value |
|---|---|
| `APPLE_API_KEY` | the full text of the `.p8` file, including the `BEGIN` / `END` lines |
| `APPLE_API_KEY_ID` | Key ID (10 characters) |
| `APPLE_API_ISSUER` | Issuer ID (a UUID) |

With `CSC_LINK` but without these three, the app is signed but not notarized, and Gatekeeper still blocks it.

## 3. Windows: Azure Trusted Signing (Artifact Signing)

1. Azure portal → **Subscriptions** → your subscription → **Resource providers** → register `Microsoft.CodeSigning`.
2. Create a **Trusted Signing / Artifact Signing account** (search for either name). Pick a region and the **Basic** SKU. Note the
   account name and the region's endpoint, for example `https://eus.codesigning.azure.net/` (East US) or
   `https://weu.codesigning.azure.net/` (West Europe).
3. Give yourself the **Trusted Signing Identity Verifier** (now "Artifact Signing Identity Verifier") role on the account (**Access control (IAM) → Add role
   assignment**), then open **Identity validation → New identity → Public** and submit the organisation's documents.
   This can take from days to weeks. Before paying, check on the Microsoft page above that Public Trust validation
   is open to your country and organisation type. The legal name and address on the Azure billing account must match
   what you want on the certificate.
4. When the validation is **Completed**: **Certificate profiles → Create → Public Trust**, select the validated
   identity. Note the profile name, and the certificate **Subject name (CN)** it shows: that is the publisher name.
5. **Microsoft Entra ID → App registrations → New registration** (name "keyframe-signing"). Note the **Application
   (client) ID** and **Directory (tenant) ID**. Under **Certificates & secrets** create a client secret and copy its
   **Value** (it expires; put the date in your calendar).
6. On the **certificate profile** (or the account): **Access control (IAM) → Add role assignment → Trusted Signing
   Certificate Profile Signer** (now "Artifact Signing Certificate Profile Signer") → assign it to the
   "keyframe-signing" app.

| GitHub secret | Value |
|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_CLIENT_ID` | Application (client) ID |
| `AZURE_CLIENT_SECRET` | the client secret **Value** |

| GitHub variable | Value |
|---|---|
| `AZURE_SIGN_ENDPOINT` | the region endpoint from step 2 |
| `AZURE_SIGN_ACCOUNT` | Trusted Signing account name |
| `AZURE_CERT_PROFILE` | certificate profile name |
| `AZURE_PUBLISHER_NAME` | the certificate's Subject name (CN), exactly as Azure shows it |

Windows signing only turns on when all seven are set. SmartScreen reputation attaches to the validated identity, so
the very first signed downloads may still show a (milder) prompt until it builds up.

## 4. Where to add them

GitHub → `Elix-Innovations/keyframe.lk` → **Settings → Secrets and variables → Actions**. Secrets go under the
**Secrets** tab, the four `AZURE_SIGN_*` / `AZURE_CERT_PROFILE` / `AZURE_PUBLISHER_NAME` values under **Variables**.

`RELEASE_TOKEN` (optional secret): only needed if the workflow ever runs from a repository other than
`Elix-Innovations/keyframe.lk`. Create a fine-grained PAT with **Contents: Read and write** on that repository. Inside
the repository itself the built-in token is used.

## 5. Cut a release

1. Bump `version` in `desktop/package.json` (and `package-lock.json`: `cd desktop && npm version 1.0.3
   --no-git-tag-version`), and get it merged into `main`.
2. Tag that commit and push the tag: `git tag v1.0.3 && git push origin v1.0.3`. The tag must match the version.
   (Or run the workflow by hand: **Actions → Release → Run workflow**; it uses the version in `desktop/package.json`.)
3. The workflow builds on `macos-14` and `windows-latest`, signs, notarizes, verifies the signatures, writes
   `SHA256SUMS.txt`, and creates a **draft** release with all three files.
4. Open the draft under **Releases**, fill in "What's new", press **Publish**.

Re-running the workflow while the release is still a draft replaces the files and leaves the notes alone. The
workflow never touches a **published** release: it warns, and leaves the builds as run artifacts (`mac`, `win`).

`make.sh` and this workflow overlap. `make.sh` pushes the `v*` tag, which also starts this workflow; because `make.sh`
publishes its own (unsigned) release first, the workflow then uploads nothing. Once signing works, release by pushing
the tag instead of letting `make.sh` build and publish.

## 6. Verify

macOS (only the app is notarized and stapled, not the `.dmg` wrapper, so check the app inside it):

```sh
hdiutil attach Keyframe-1.0.3-arm64.dmg
APP="/Volumes/Install Keyframe/Keyframe.app"   # adjust if the volume is named differently
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dvv "$APP" 2>&1 | grep -E 'Authority|TeamIdentifier|flags'   # Developer ID Application, flags=...(runtime)
spctl -a -vv "$APP"                             # accepted, source=Notarized Developer ID
xcrun stapler validate "$APP"                   # The validate action worked!
codesign -dvv "$APP/Contents/Resources/bin/ffmpeg" 2>&1 | grep -E 'Authority|flags'
```

The real test: download the `.dmg` in a browser on another Mac, drag to Applications, double-click. It must open with
only the normal "downloaded from the Internet" prompt.

Windows (PowerShell):

```powershell
Get-AuthenticodeSignature .\Keyframe-Setup-1.0.3-x64.exe | Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
# after installing:
Get-AuthenticodeSignature "$env:LOCALAPPDATA\Programs\Keyframe\Keyframe.exe" | Format-List Status, SignerCertificate
```

`Status` must be `Valid`, and the signer subject must be your validated organisation.

## How it is wired

- `desktop/package.json` keeps the local defaults: macOS `identity: "-"` (ad-hoc), hardened runtime with
  `desktop/entitlements.mac.plist`, Windows `signAndEditExecutable: false`. Local `npm run dist` / `dist:win` need no
  certificates.
- With `CSC_LINK` present, the macOS job removes `build.mac.identity` from `package.json` (in the CI checkout only),
  so electron-builder finds the Developer ID certificate in `CSC_LINK`. It notarizes when the three `APPLE_API_*`
  environment variables are set. Every Mach-O file in the bundle is signed with the hardened runtime, including
  `Resources/bin/uv`, `Resources/bin/ffmpeg` and the native modules under `Resources/web/node_modules`.
- With the Azure values present, the Windows job sets `build.win.signAndEditExecutable: true` and
  `build.win.azureSignOptions`. electron-builder then signs `Keyframe.exe`, `uv.exe`, `ffmpeg.exe`, `ffprobe.exe`,
  the installer and the uninstaller.
- Python and PyTorch, which the app downloads at runtime for caption timing, live in the user's data folder, outside
  the signed bundle. They run as separate processes and do not affect the signature.
- Nothing may write inside `Keyframe.app` at runtime: an added file breaks the signature's seal
  (`codesign --verify --deep --strict` then reports "a sealed resource is missing or invalid"). Run the verify
  commands on a fresh copy, and once more after using the app, to catch regressions.
