export { default } from './middleware.js';

export let EncryptPlugin = null;

try{
  EncryptPlugin = require('./EncryptPlugin.js').default;
}catch(e){
  if(e.code !== 'MODULE_NOT_FOUND'){
    throw e;
  }
}
