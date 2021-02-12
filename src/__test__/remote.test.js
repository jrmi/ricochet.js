import request from 'supertest';
import express from 'express';
import remote from '../remote';

describe('Remote Test', () => {
  let app;
  let query;
  let content;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    content = { hello: true };
    app.use(
      remote({
        setupFunction: 'mysetup',
        configFile: '/myconfig.json',
        context: { content },
      })
    );
    app.all('/remote/test', (req, res) => {
      res.send('ok');
    });
    query = request(app);
  });

  it('should allow calls with Origin, X-Ricochet-Origin, referer header', async () => {
    await query.get(`/remote/test`).expect(400);
    await query
      .get(`/remote/test`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(200);
    await query
      .get(`/remote/test`)
      .set('Origin', 'http://localhost:5000')
      .expect(200);
    await query
      .get(`/remote/test`)
      .set('Referer', 'http://localhost:5000/test/toto')
      .expect(200);
  });

  it('should load setup from remote', async () => {
    expect(content).not.toEqual(
      expect.objectContaining({ hello: true, response: 42 })
    );

    await query
      .get(`/remote/test`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(200);

    // Is setup really processed ?
    expect(content).toEqual(
      expect.objectContaining({ hello: true, response: 42 })
    );

    // Try again
    await query
      .get(`/remote/test`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(200);
  });

  it('should fails on missing config file', async () => {
    app = express();
    app.use(express.json());
    app.use(
      remote({
        setupFunction: 'mysetup',
        configFile: '/noconfig.json',
      })
    );
    app.all('/remote/test', (req, res) => {
      res.send('ok');
    });
    query = request(app);

    const result = await query
      .get(`/remote/test`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(400);
  });

  it('should fails with bad config file', async () => {
    app = express();
    app.use(express.json());
    app.use(
      remote({
        setupFunction: 'mysetup',
        configFile: '/badconfigfile.json',
      })
    );
    app.all('/remote/test', (req, res) => {
      res.send('ok');
    });
    query = request(app);

    const result = await query
      .get(`/remote/test`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(500);
  });

  it('should fails to parse setup', async () => {
    app = express();
    app.use(express.json());
    app.use(
      remote({
        setupFunction: 'bad',
        configFile: '/myconfig.json',
      })
    );
    app.all('/remote/test', (req, res) => {
      res.send('ok');
    });
    query = request(app);

    const result = await query
      .get(`/remote/test`)
      .set('X-Ricochet-Origin', 'http://localhost:5000')
      .expect(500);

    expect(result.body.stackTrace).toEqual(
      expect.stringContaining('Unexpected identifier')
    );
  });
});
