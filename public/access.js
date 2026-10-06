export const ACCESS_STORAGE_KEY = 'littlepay-private-access-v1';
export const validAccessKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function takePrivateLink(url, replaceURL) {
  const address=new URL(url), fragment=new URLSearchParams(address.hash.slice(1));
  if(!fragment.has('access'))return null;
  const key=fragment.get('access');address.hash='';replaceURL(address.pathname+address.search);
  if(!validAccessKey(key))throw new Error('ลิงก์ส่วนตัวไม่ครบ กรุณาเปิดลิงก์เดิมอีกครั้ง');
  return key;
}
