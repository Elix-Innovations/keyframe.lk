// electron-builder afterPack hook: give Keyframe.exe its own icon and version info.
//
// `win.signAndEditExecutable` is off (the stock editing step needs Wine when building on macOS/Linux), so the packaged
// exe would otherwise keep Electron's default icon, and Task Manager / the taskbar / shortcuts would show "Electron".
// `resedit` is pure JavaScript (already installed as an electron-builder dependency), so it works on any host.
const fs = require('node:fs');
const path = require('node:path');
const ResEdit = require('resedit');

// electron-builder 26 always drops a top-level `node_modules` folder from extraResources (app-builder-lib
// util/filter.js), which leaves the bundled Next.js server (build/web) unable to `require('next')`. Copy those
// folders in after packing so the app gets exactly what scripts/prepare.mjs staged.
function copyResourceNodeModules(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  for (const { from, to } of context.packager.config.extraResources || []) {
    const src = path.join(context.packager.projectDir, from, 'node_modules');
    if (!fs.existsSync(src)) continue;
    const dest = path.join(resources, to, 'node_modules');
    fs.cpSync(src, dest, { recursive: true, force: true, verbatimSymlinks: true });
    console.log(`  • after-pack: copied ${from}/node_modules -> ${to}/node_modules`);
  }
}

exports.default = async function afterPack(context) {
  copyResourceNodeModules(context);
  if (context.electronPlatformName !== 'win32') return;
  const { productName, version } = context.packager.appInfo;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icoPath = path.join(context.packager.projectDir, 'icon.ico');

  const nt = ResEdit.NtExecutable.from(fs.readFileSync(exe));
  const res = ResEdit.NtExecutableResource.from(nt);

  // Replace every icon group Electron ships with ours (keeps the group ids Windows already points at).
  const icons = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath)).icons.map((i) => i.data);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  if (groups.length === 0) throw new Error('after-pack: no icon group found in Keyframe.exe');
  for (const g of groups) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, icons);

  // "Electron" -> "Keyframe" in the file properties.
  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
  const [major = 1, minor = 0, patch = 0] = String(version).split('.').map((n) => parseInt(n, 10) || 0);
  vi.setFileVersion(major, minor, patch, 0, lang.lang);
  vi.setProductVersion(major, minor, patch, 0, lang.lang);
  vi.setStringValues(lang, {
    ProductName: productName,
    FileDescription: productName,
    InternalName: productName,
    OriginalFilename: `${productName}.exe`,
    CompanyName: 'Elix Innovations',
    LegalCopyright: 'Copyright © Elix Innovations',
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(nt);
  fs.writeFileSync(exe, Buffer.from(nt.generate()));
  console.log(`  • after-pack: set icon + version info on ${path.basename(exe)}`);
};
