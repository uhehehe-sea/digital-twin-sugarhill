Promise.all([
  fetch('http://localhost:8088/v2').then(r => r.text()),
  fetch('http://localhost:8088/editor_v2.js').then(r => r.text())
]).then(([html, js]) => {
  console.log('HTML has slider-cam-speed:', html.includes('id="slider-cam-speed"'));
  console.log('HTML has label-cam-speed:', html.includes('id="label-cam-speed"'));
  console.log('JS has setCameraSpeedMultiplier:', js.includes('function setCameraSpeedMultiplier'));
  console.log('JS has BracketLeft hotkey:', js.includes('BracketLeft'));
  console.log('JS has baseCameraSpeed:', js.includes('baseCameraSpeed = 7500'));
}).catch(err => console.error(err));
