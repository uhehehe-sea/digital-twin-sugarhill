Promise.all([
  fetch('http://localhost:8088/v2').then(r => r.text()),
  fetch('http://localhost:8088/editor_v2.js').then(r => r.text())
]).then(([html, js]) => {
  console.log('HTML length:', html.length);
  console.log('JS length:', js.length);
  console.log('HTML has top-toolbar:', html.includes('id="top-toolbar"'));
  console.log('HTML has viewport 100vw:', html.includes('width: 100vw !important'));
  console.log('JS has initFloatingWindows:', js.includes('function initFloatingWindows'));
  console.log('JS has cornerGrip handler:', js.includes('cornerGrip.addEventListener'));
  console.log('JS has window bindings:', js.includes('window.resetFloatingWindows = resetFloatingWindows'));
}).catch(err => console.error(err));
