import {PrivateItemHistoryWork} from './api-private-item-history-work.mjs';
import {ItemHourExportPilot} from './api-item-hour-export-pilot.mjs';
// Two kinds inside the EXISTING history slot. No new native alarm or consumer.
export class PrivateItemHistoryWithExportWork extends PrivateItemHistoryWork{
 constructor(ctx,env,core,options){super(ctx,env,core,options);this.exportPilot=new ItemHourExportPilot(ctx,env,core,()=>this);this.exportFlight=null;}
 nextDue(){const ready=this.plan&&this.control().registry_state==='ready',values=[super.nextDue(),ready?this.exportPilot?.nextDue()??null:null].filter(v=>v!==null);return values.length?Math.min(...values):null;}
 defer(){const values=[super.defer(),this.exportPilot?.defer()??null].filter(v=>v!==null);return values.length?Math.min(...values):null;}
 async drainOne(beforeIO){if(this.exportFlight)return{status:'history_busy',providerAttempted:false};const a=super.nextDue(),b=this.plan&&this.control().registry_state==='ready'?this.exportPilot.nextDue():null,now=this.core.clock(),intake=a!==null&&a<=now,exp=b!==null&&b<=now;let kind='intake';if(exp&&(!intake||this.exportPilot.control().last_work==='intake'))kind='export';if(this.exportPilot.active)this.core.sql.exec('UPDATE private_item_hour_export_control SET last_work=? WHERE id=1',kind);const task=kind==='export'?this.exportPilot.drainOne(beforeIO):super.drainOne(beforeIO);this.exportFlight=task;try{return await task;}finally{if(this.exportFlight===task)this.exportFlight=null;}}
}
