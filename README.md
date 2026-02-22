# Next.js File Transfer Webpage Using Aliyun OSS

A high-performance file management and transfer platform built with **Next.js 14+**. This project has evolved from a local-storage Express app into a cloud-native solution utilizing **Aliyun OSS**, featuring real-time streaming compression and automated lifecycle management.

## Core Features

* **Cloud-Native Storage**: Seamlessly integrated with Aliyun OSS, eliminating local server disk constraints.
* **STS Secure Authentication**: Implements Security Token Service (STS) for temporary credentials, ensuring secure client-side uploads without exposing master AccessKeys.
* **Optimized Download Experience**:
* **Live Streaming Compression**: Powered by `archiver`, the server zips files on-the-fly and streams data directly to the user—zero temporary files, zero server disk usage.
* **Browser-Managed Downloads**: Optimized `Content-Disposition` and `Accept-Ranges` headers ensure stable, large-file downloads handled directly by the browser's download manager.

## Tech Stack

* **Framework**: [Next.js 14 (App Router)](https://nextjs.org/)
* **Storage**: [Aliyun OSS](https://www.aliyun.com/product/oss)
* **Compression**: [Archiver.js](https://www.archiverjs.com/)
* **Deployment**: [Vercel](https://vercel.com) / [CentOS + PM2 + Nginx]
* **Icons**: Custom-designed SVG vector graphics

## Quick Start

### 1. Clone and Install

```bash
git clone -b vercel https://github.com/Jacky2080/filetransfer.git
cd filetransfer
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
OSS_ACCESS_KEY_ID=your_access_key
OSS_ACCESS_KEY_SECRET=your_access_secret
OSS_ROLE_ARN=your_sts_role_arn
OSS_BUCKET=files-for-transfer
OSS_REGION=oss-cn-shanghai
```

### 3. Run Development Server

```bash
npm run dev

```

## Deployment

### Option A: Vercel Platform (Recommended)

1. Push your code to GitHub.
2. Import the project into Vercel.
3. Add all variables from `.env.local` to `Settings > Environment Variables`.
4. **Note**: Vercel Free tier has a 10s API timeout. For very large zipping tasks, consider Option B.

### Option B: Self-Hosted

1. Build the project: `npm run build`.
2. Use PM2 to manage the process:

```bash
pm2 start npm --name "next-oss" -- start
```

3. Configure Nginx as a reverse proxy and increase `proxy_read_timeout` to support long-duration stream zipping.

## Maintenance & Operations

### Automatic File Purge

This project utilizes **OSS Lifecycle Rules** rather than manual cron jobs for maximum reliability:

* **Scope**: Entire Bucket (or specific prefix).
* **Action**: Expiration-based deletion.
* **Period**: 7 Days.
* **Execution**: Managed by Aliyun back-end at 06:00 CST daily.

## License

MIT License
