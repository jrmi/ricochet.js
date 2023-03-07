import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import tempy from 'tempy';
import aws from '@aws-sdk/client-s3';

import { getDirname } from '../utils.js';
import fileStore from '../fileStore';
import {
  MemoryFileBackend,
  DiskFileBackend,
  S3FileBackend,
} from '../fileStore/backends';

import { S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT } from '../settings';

const { S3, DeleteObjectsCommand, ListObjectsCommand } = aws;

const __dirname = getDirname(import.meta.url);

jest.mock('nanoid', () => {
  let count = 0;
  return {
    customAlphabet: () =>
      jest.fn(() => {
        return 'nanoid_' + count++;
      }),
  };
});

const tempDestination = tempy.directory({ prefix: 'test__' });

const fileStores = [
  ['memory', MemoryFileBackend(), { prefix: 'pref' }],
  [
    'disk',
    DiskFileBackend({
      destination: tempDestination,
      prefix: 'pref',
    }),
    { prefix: 'pref' },
  ],
];

const S3_BUCKET_TEST = process.env.S3_BUCKET_TEST;

if (S3_BUCKET_TEST) {
  fileStores.push([
    's3',
    S3FileBackend({
      bucket: process.env.S3_BUCKET_TEST,
      secretKey: S3_SECRET_KEY,
      accessKey: S3_ACCESS_KEY,
      endpoint: S3_ENDPOINT,
    }),
    {
      prefix: 'pref',
    },
  ]);
}

describe.each(fileStores)(
  'Backend <%s> file store',
  (backendType, backend, options) => {
    let app;
    let query;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        '/:siteId/pref/:boxId/:id/file',
        (req, _, next) => {
          req.siteId = req.params.siteId;
          req.boxId = req.params.boxId;
          req.resourceId = req.params.id;
          next();
        },
        fileStore(backend, options)
      );
      query = request(app);
    });

    afterAll(async () => {
      // Clean files
      if (backendType === 'disk') {
        try {
          fs.rmSync(tempDestination, { recursive: true });
        } catch (e) {
          console.log(e);
        }
        return;
      }
      // Clean bucket
      if (backendType === 's3') {
        const { bucket, secretKey, accessKey, endpoint } = {
          bucket: process.env.S3_BUCKET_TEST,
          secretKey: S3_SECRET_KEY,
          accessKey: S3_ACCESS_KEY,
          endpoint: S3_ENDPOINT,
        };

        const s3 = new S3({
          secretAccessKey: secretKey,
          accessKeyId: accessKey,
          endpoint: endpoint,
        });

        const params = {
          Bucket: bucket,
        };

        const data = await s3.send(new ListObjectsCommand(params));
        if (data.Contents) {
          const deleteParams = {
            Bucket: bucket,
            Delete: { Objects: data.Contents.map(({ Key }) => ({ Key })) },
          };
          await s3.send(new DeleteObjectsCommand(deleteParams));
          return;
        }
      }

      if (backendType === 'memory') {
        return;
      }
    });

    it('should store file', async () => {
      const boxId = 'box010';
      const res = await query
        .post(`/mysiteid/pref/${boxId}/1234/file/`)
        .attach('file', path.resolve(__dirname, 'testFile.txt'))
        .expect(200);

      expect(res.text).toEqual(
        expect.stringContaining(`mysiteid/pref/${boxId}/1234/file/`)
      );
    });

    it('should retreive image file', async () => {
      const boxId = 'box020';
      const res = await query
        .post(`/mysiteid/pref/${boxId}/1234/file/`)
        .attach('file', path.resolve(__dirname, 'test.png'))
        .expect(200);

      const fileUrl = res.text;

      const fileRes = await query
        .get(`/${fileUrl}`)
        .buffer(false)
        .redirects(1)
        .expect(200);

      expect(fileRes.type).toBe('image/png');
      expect(fileRes.body.length).toBe(6174);
    });

    it('should retreive text file', async () => {
      const boxId = 'box025';
      const res = await query
        .post(`/mysiteid/pref/${boxId}/1234/file/`)
        .set('Content-Type', 'text/plain')
        .attach('file', path.resolve(__dirname, 'testFile.txt'))
        .expect(200);

      const fileUrl = res.text;

      const fileRes = await query
        .get(`/${fileUrl}`)
        .buffer(false)
        .redirects(1)
        .expect(200);

      expect(fileRes.type).toBe('text/plain');
    });

    it('should list files', async () => {
      const boxId = 'box030';

      const fileListEmpty = await query
        .get(`/mysiteid/pref/${boxId}/1235/file/`)
        .expect(200);

      expect(Array.isArray(fileListEmpty.body)).toBe(true);
      expect(fileListEmpty.body.length).toBe(0);

      const res = await query
        .post(`/mysiteid/pref/${boxId}/1235/file/`)
        .attach('file', path.resolve(__dirname, 'testFile.txt'))
        .expect(200);

      const res2 = await query
        .post(`/mysiteid/pref/${boxId}/1235/file/`)
        .attach('file', path.resolve(__dirname, 'test.png'))
        .expect(200);

      const fileList = await query
        .get(`/mysiteid/pref/${boxId}/1235/file/`)
        .expect(200);

      expect(Array.isArray(fileList.body)).toBe(true);
      expect(fileList.body.length).toBe(2);
      expect(fileList.body[0]).toEqual(
        expect.stringContaining(`mysiteid/pref/${boxId}/1235/file/`)
      );
    });

    it('should delete file', async () => {
      const boxId = 'box040';
      const res = await query
        .post(`/mysiteid/pref/${boxId}/1234/file/`)
        .attach('file', path.resolve(__dirname, 'test.png'))
        .expect(200);

      const fileUrl = res.text;

      await query.delete(`/${fileUrl}`).buffer(false).expect(200);

      const fileList = await query
        .get(`/mysiteid/pref/${boxId}/1234/file/`)
        .expect(200);
      expect(fileList.body.length).toBe(0);
    });

    it('should return 404', async () => {
      const boxId = 'box050';

      await query.get(`/mysiteid/pref/${boxId}/1234/file/nofile`).expect(404);
      await query
        .delete(`/mysiteid/pref/${boxId}/1234/file/nofile`)
        .expect(404);

      // To create box
      await query
        .post(`/mysiteid/pref/${boxId}/1234/file/`)
        .attach('file', path.resolve(__dirname, 'test.png'))
        .expect(200);

      await query.get(`/mysiteid/pref/${boxId}/1234/file/nofile2`).expect(404);
      await query
        .delete(`/mysiteid/pref/${boxId}/1234/file/nofile2`)
        .expect(404);
    });
  }
);
