import assert from 'node:assert/strict';
import { test } from 'node:test';
import toast from 'react-hot-toast';
import { notifyWriteSuccess } from './write-feedback';
test('local rows, Axios responses and bulk pending results never display a server-success toast',()=>{
 const original=toast.success;let successes=0;
 toast.success=()=>{successes++;return 'confirmed';};
 try{
  notifyWriteSuccess({synced:0},'Approved');
  notifyWriteSuccess({data:{synced:0}},'Approved');
  notifyWriteSuccess([{data:{synced:1}},{data:{synced:0}}],'Approved');
  assert.equal(successes,0);
  notifyWriteSuccess({data:{synced:1}},'Approved');assert.equal(successes,1);
 }finally{toast.success=original;toast.remove();}
});
