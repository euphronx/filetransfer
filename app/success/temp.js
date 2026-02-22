import OSS, { STS } from "ali-oss";
import { inspect } from "node:util";

const c = new STS({
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
});
const result = await c.assumeRole(process.env.OSS_ROLE_ARN, "", 3600);
const tokens = {
  accessKeyId: result.credentials.AccessKeyId,
  accessKeySecret: result.credentials.AccessKeySecret,
  stsToken: result.credentials.SecurityToken,
  bucket: "files-for-transfer",
};
const client = new OSS({
  region: "oss-cn-shanghai",
  authorizationV4: true,
  accessKeyId: tokens.accessKeyId,
  accessKeySecret: tokens.accessKeySecret,
  stsToken: tokens.stsToken,
  bucket: tokens.bucket,
});
console.log(inspect(tokens, { depth: null, colors: true }));
const list = await client.list({ prefix: "2026-02-22" });
console.log(inspect(list, { depth: null, colors: true }));
const url = client.signatureUrl("2026-02-22/Db-Liko.jpg", {
  "content-disposition": `attachment; filename=Db-Liko.app`,
});
console.log(url);
