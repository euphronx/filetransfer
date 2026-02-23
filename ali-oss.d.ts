declare module "ali-oss" {
  interface Options {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    stsToken: string;
    bucket: string;
    authorizationV4: boolean;
    secure: boolean;
  }

  interface PutResult {
    name: string;
    url: string;
    res: any;
  }

  export default class OSS {
    constructor(options: Options);
    put(fileName: string, file: any, options?: any): Promise<PutResult>;
    list(options: object);
    signatureUrl(fileName: string, options: object);
    head(fileName: string, options?: object);
    delete(fileName: string, options?: object);
  }

  export class STS {
    constructor(options: { accessKeyId: string; accessKeySecret: string });
    assumeRole(
      roleArn: string,
      policy?: string | null,
      expiration?: number,
      sessionName?: string
    ): Promise<{
      credentials: {
        AccessKeyId: string;
        AccessKeySecret: string;
        SecurityToken: string;
        Expiration: string;
      };
    }>;
  }
}
