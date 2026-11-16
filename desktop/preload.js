// Bridge between the editor (web/src/lib/desktop.ts) and the main process. The editor runs sandboxed with context
// isolation, so this is the only thing it can reach: caption-timing setup (see aligner.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyframeDesktop', {
  aligner: {
    status: () => ipcRenderer.invoke('aligner:status'),
    install: () => ipcRenderer.invoke('aligner:install'),
    cancel: () => ipcRenderer.invoke('aligner:cancel'),
    openLog: () => ipcRenderer.invoke('aligner:openLog'),
    openLink: () => ipcRenderer.invoke('aligner:openLink'),
    onChange: (cb) => {
      const h = (_e, s) => cb(s);
      ipcRenderer.on('aligner:state', h);
      return () => ipcRenderer.removeListener('aligner:state', h);
    },
  },
});
