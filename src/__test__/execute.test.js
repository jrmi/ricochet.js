import request from 'supertest';
import express from 'express';
import execute from '../execute';

jest.mock('nanoid', () => {
  let count = 0;
  return {
    nanoid: jest.fn(() => {
      return 'nanoid_' + count++;
    }),
  };
});

let delta = 0;

// Fake date
jest.spyOn(global.Date, 'now').mockImplementation(() => {
  delta += 1;
  const second = delta < 10 ? '0' + delta : '' + delta;
  return new Date(`2020-03-14T11:01:${second}.135Z`).valueOf();
});

describe('Store Test', () => {
  let app;
  let query;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(execute());
    query = request(app);
  });

  it('should execute remote function', async () => {
    await query
      .get(`/execute/missingfunction`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(404);

    const result = await query
      .get(`/execute/mytestfunction/`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(200);
    expect(result.body).toEqual(expect.objectContaining({ hello: true }));
    expect(result.body.method).toBe('GET');

    const result2 = await query
      .post(`/execute/mytestfunction`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .send({ test: 42 })
      .expect(200);
    expect(result2.body.method).toBe('POST');
    expect(result2.body.body).toEqual(expect.objectContaining({ test: 42 }));
  });

  it('should run remote function with id', async () => {
    const result = await query
      .get(`/execute/mytestfunction/42`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(200);
    expect(result.body).toEqual(expect.objectContaining({ id: '42' }));
  });

  it('should fails to parse', async () => {
    const result = await query
      .get(`/execute/bad`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(500);
    expect(result.body.stackTrace).toEqual(
      expect.stringContaining('no js here !!!')
    );
  });

  it('should load setup', async () => {
    const app2 = express();
    app2.use(express.json());
    app2.use(execute({ setup: 'mysetup' }));

    const result = await request(app2)
      .get(`/execute/mytestfunction/`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(200);

    expect(result.body).toEqual(expect.objectContaining({ response: 42 }));
  });
});
