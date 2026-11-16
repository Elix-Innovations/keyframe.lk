import { redirect } from 'next/navigation';

// The marketing landing page lives in its own project (keyframe.lk-landing), hosted separately.
// Running this app locally opens the editor home straight away.
export default function Page() {
  redirect('/editor');
}
