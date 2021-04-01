import request from 'supertest';
import express from 'express';
import fileStore from '../resourceFileStore';
import {
  MemoryFileBackend,
  DiskFileBackend,
  S3FileBackend,
} from '../fileStoreBackend';
import path from 'path';
import fs from 'fs';
import tempy from 'tempy';
import aws from 'aws-sdk';
import { S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT } from '../settings';

jest.mock('nanoid', () => {
  let count = 0;
  return {
    nanoid: jest.fn(() => {
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

    afterAll((done) => {
      // Clean files
      if (backendType === 'disk') {
        try {
          fs.rmdirSync(tempDestination, { recursive: true });
        } catch (e) {
          console.log(e);
        }
        done();
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

        aws.config.update({
          secretAccessKey: secretKey,
          accessKeyId: accessKey,
          endpoint: endpoint,
        });

        const s3 = new aws.S3();

        const params = {
          Bucket: bucket,
        };

        s3.listObjects(params, (err, data) => {
          const deleteParams = {
            Bucket: bucket,
            Delete: { Objects: data.Contents.map(({ Key }) => ({ Key })) },
          };
          s3.deleteObjects(deleteParams, (err, deleteData) => {
            done();
          });
        });
        return;
      }
      done();
    });

    it('should store file', async () => {
      const boxId = 'box010';
      const res = await query
        .post(`/mysiteid/pref/${boxId}/1234/file/`)
        .attach('file', path.resolve(__dirname, 'testFile.txt'))
        .expect(200);

      expect(res.text).toEqual(
        expect.stringContaining(`mysiteid/pref/${boxId}/1234/file/nanoid_`)
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
        expect.stringContaining(`mysiteid/pref/${boxId}/1235/file/nanoid_`)
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
