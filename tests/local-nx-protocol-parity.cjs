const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={window:{},TextEncoder};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/api-nx-protocol.js'),'utf8'),context);
const cases=JSON.parse(fs.readFileSync(0,'utf8')),out=cases.map(text=>{try{context.window.AstraApiNxProtocol.validate(context.window.AstraApiNxProtocol.parse(text));return true;}catch{return false;}});process.stdout.write(JSON.stringify(out));
