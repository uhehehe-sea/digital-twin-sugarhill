Promise.all([
  fetch('http://localhost:8088/v2').then(r => r.text()),
  fetch('http://localhost:8088/editor_v2.js').then(r => r.text())
]).then(([html, js]) => {
  console.log('HTML length:', html.length);
  console.log('JS length:', js.length);
  console.log('HTML has win-plc:', html.includes('id="win-plc"'));
  console.log('HTML has card-cad-tools:', html.includes('id="card-cad-tools"'));
  console.log('JS has virtualPLC:', js.includes('const virtualPLC'));
  console.log('JS has applyChamferToBevelSelected:', js.includes('function applyChamferToBevelSelected'));
  console.log('JS has dynamicCNCSpindleRotor:', js.includes('dynamicCNCSpindleRotor'));
  console.log('JS has win-plc in winIds:', js.includes("'win-plc'"));
}).catch(err => console.error(err));
