import request from 'supertest';
import express from 'express';

import remote from '../remote';
import origin from '../origin';

describe('Remote Test', () => {
  let app;
  let query;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(
      (req, _, next) => {
        req.siteId = 'mysiteid';
        next();
      },
      origin(),
      remote({
        setupPath: 'scripts/mysetup.js',
        context: { content: {} },
      })
    );
    query = request(app);
  });

  it('should allow calls with Origin, X-Ricochet-Origin, Referer header', async () => {
    await query.get(`/ping`).expect(400);
    await query
      .get(`/ping`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(200);
    await query.get(`/ping`).set('Origin', 'http://localhost:5000').expect(200);
    await query
      .get(`/ping`)
      .set('Referer', 'http://localhost:5000/test/toto')
      .expect(200);
  });

  it('should fails to parse setup', async () => {
    app = express();
    app.use(express.json());
    app.use(
      (req, _, next) => {
        req.ricochetOrigin = 'http://localhost:5000';
        next();
      },
      remote({
        setupPath: 'scripts/bad.js',
      })
    );
    query = request(app);

    const result = await query
      .get(`/`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(500);

    expect(result.body.message).toEqual(
      expect.stringContaining('Unexpected identifier')
    );
  });
});
