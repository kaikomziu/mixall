const { STORE_NAMES, getJSON, deleteKey, listKeys } = require('../lib/store');
exports.handler = async (event) => {

  const now=Date.now(); let deletedRooms=0,deletedShares=0,deletedRateLimits=0,deletedBackgroundJobs=0;
  try {
    for(const key of await listKeys(STORE_NAMES.TEMP_ROOMS,'room:')){const row=await getJSON(STORE_NAMES.TEMP_ROOMS,key);if(!row||Number(row.expiresAt)<=now){await deleteKey(STORE_NAMES.TEMP_ROOMS,key);deletedRooms++;}}
    for(const key of await listKeys(STORE_NAMES.TEMP_SHARES,'share:')){const row=await getJSON(STORE_NAMES.TEMP_SHARES,key);if(!row||Number(row.expiresAt)<=now){await deleteKey(STORE_NAMES.TEMP_SHARES,key);deletedShares++;}}
    for(const key of await listKeys(STORE_NAMES.TOOL_DATA)){const row=await getJSON(STORE_NAMES.TOOL_DATA,key);if(!row||Number(row.at)<now-24*60*60*1000){await deleteKey(STORE_NAMES.TOOL_DATA,key);deletedRateLimits++;}}
    for(const key of await listKeys(STORE_NAMES.AI_JOBS)){const job=await getJSON(STORE_NAMES.AI_JOBS,key);const created=Date.parse(job?.createdAt||'')||0;if(!job||Number(job.expiresAt)<=now||(job.status==='failed'&&created<now-24*60*60*1000)){await deleteKey(STORE_NAMES.AI_JOBS,key);deletedBackgroundJobs++;}}
    return {statusCode:200,body:JSON.stringify({ok:true,deletedRooms,deletedShares,deletedRateLimits,deletedBackgroundJobs})};
  }catch(error){console.error('temporary tools cleanup failed',error);return {statusCode:500,body:JSON.stringify({error:'temporary tools cleanup failed'})};}
};
