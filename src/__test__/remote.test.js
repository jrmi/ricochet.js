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
        configFile: 'myconfig.json',
        context: { content },
      })
    );
    app.all('/remote/test', (req, res) => {
      res.send('ok');
    });
    query = request(app);
  });

  it('should allow only call with Origin or X-SPC-Host header', async () => {
    await query.get(`/remote/test`).expect(400);
    await query
      .get(`/remote/test`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(200);
    await query
      .get(`/remote/test`)
      .set('origin', 'http://localhost:5000/')
      .expect(200);
  });

  it('should load setup from remote', async () => {
    expect(content).not.toEqual(
      expect.objectContaining({ hello: true, response: 42 })
    );

    await query
      .get(`/remote/test`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(200);

    // Is setup really processed ?
    expect(content).toEqual(
      expect.objectContaining({ hello: true, response: 42 })
    );
  });

  it('should fails to find config file', async () => {
    app = express();
    app.use(express.json());
    content = { hello: true };
    app.use(
      remote({
        setupFunction: 'mysetup',
        configFile: 'badconfigfile.json',
        context: { content },
      })
    );
    app.all('/remote/test', (req, res) => {
      res.send('ok');
    });
    query = request(app);

    const result = await query
      .get(`/remote/test`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(200);
  });

  it('should fails to parse setup', async () => {
    app = express();
    app.use(express.json());
    content = { hello: true };
    app.use(
      remote({
        setupFunction: 'bad',
        configFile: 'myconfig.json',
        context: { content },
      })
    );
    app.all('/remote/test', (req, res) => {
      res.send('ok');
    });
    query = request(app);

    const result = await query
      .get(`/remote/test`)
      .set('X-SPC-Host', 'http://localhost:5000/')
      .expect(500);

    expect(result.body.stackTrace).toEqual(
      expect.stringContaining('no js here !!!')
    );
  });
});
