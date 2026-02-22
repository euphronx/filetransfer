import { NextResponse } from "next/server";
import OSS, { STS } from "ali-oss";
import archiver from "archiver";

async function getTokens() {
  try {
    const client = new STS({
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    });
    const result = await client.assumeRole(process.env.OSS_ROLE_ARN!, "", 3600);
    return {
      accessKeyId: result.credentials.AccessKeyId,
      accessKeySecret: result.credentials.AccessKeySecret,
      stsToken: result.credentials.SecurityToken,
      bucket: "files-for-transfer",
    };
  } catch (error: any) {
    console.error("Error acquiring STS Token:", error);
    return null;
  }
}

export async function GET(req: Request) {
  // Get client
  const tokens = await getTokens();
  if (!tokens) return NextResponse.json({ error: "Internal error" }, { status: 500 });
  const { accessKeyId, accessKeySecret, stsToken, bucket } = tokens;
  const client = new OSS({
    region: "oss-cn-shanghai",
    authorizationV4: true,
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
    stsToken: stsToken,
    bucket: bucket,
    secure: true,
  });

  // Get files to download
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const files = searchParams.get("files")?.split(",");
  console.log(`starting to download files: ${files}`);
  if (!files || !date) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  // const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 5 } });
  // (async () => {
  //   try {
  //     for (const file of files) {
  //       const result = await client.getStream(`${date}/${file}`);
  //       archive.append(result.stream as Readable, { name: file });
  //     }
  //     await archive.finalize();
  //   } catch (err) {
  //     console.error("Archiving error:", err);
  //     passthrough.destroy(err as Error);
  //   }
  // })();

  // const webStream = new ReadableStream({
  //   start(controller) {
  //     passthrough.on("data", (chunk) => controller.enqueue(chunk));
  //     passthrough.on("end", () => controller.close());
  //     passthrough.on("error", (err) => controller.error(err));
  //   },
  //   cancel() {
  //     passthrough.destroy();
  //     archive.abort();
  //   },
  // });

  const stream = new ReadableStream({
    async start(controller) {
      archive.on("data", (chunk) => controller.enqueue(chunk));
      archive.on("end", () => controller.close());
      archive.on("error", (err) => controller.error(err));

      for (const file of files) {
        const result = await client.getStream(`${date}/${file}`);
        archive.append(result.stream, { name: file });
      }

      await archive.finalize();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="files_${date}.zip"`,
      "Cache-Control": "no-transform, no-cache",
      "Accept-Ranges": "none",
    },
  });
}
