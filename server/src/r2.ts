import "dotenv/config";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — copy server/.env.example to server/.env and fill it in.`);
  return v;
}

let client: S3Client | null = null;
export function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

export const r2Bucket = () => requireEnv("R2_BUCKET");

export async function presignedUploadUrl(key: string, mime: string, seconds = 600): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: r2Bucket(), Key: key, ContentType: mime }),
    { expiresIn: seconds }
  );
}

export async function presignedDownloadUrl(key: string, seconds = 3600): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: r2Bucket(), Key: key }), {
    expiresIn: seconds,
  });
}
