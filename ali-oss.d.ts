declare module "ali-oss" {
  interface Options {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    stsToken: string;
    bucket: string;
    authorizationV4: boolean;
    secure: boolean;

    refreshSTSToken?: () => Promise<{
      accessKeyId: string;
      accessKeySecret: string;
      stsToken: string;
    }>;
  }

  interface PutResult {
    name: string;
    url: string;
    res: any;
  }

  export default class OSS {
    constructor(options: Options);
    put(name: string, file: any, options?: any): Promise<PutResult>;
    list(options: object);
    signatureUrl(fileName: string, options: object);
    head(fileName: string, options?: object);
    getStream(name: string, options?: OSS.GetStreamOptions | undefined);
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
