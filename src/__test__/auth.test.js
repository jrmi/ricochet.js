import request from 'supertest';
import express from 'express';
import auth from '../authentication';

describe('Authentication test', () => {
  let query;
  let onSendToken;
  let onLogin;
  let onLogout;

  beforeEach(() => {
    onSendToken = jest.fn(({ remote, userEmail, userId, token, req }) =>
      Promise.resolve()
    );
    onLogin = jest.fn();
    onLogout = jest.fn();
    const app = express();
    app.use(express.json());
    app.use(
      auth({
        secret: 'My test secret key',
        onSendToken,
        onLogin,
        onLogout,
      })
    );
    query = request(app);
  });

  it('should get and verify token', async () => {
    await query
      .post('/auth/')
      .set('X-Auth-Host', 'http://localhost:5000/')
      .send({ userEmail: 'test@yopmail' })
      .expect(200);

    const userId = onSendToken.mock.calls[0][0].userId;
    const token = onSendToken.mock.calls[0][0].token;

    const result = await query
      .get(`/auth/verify/${userId}/${token}`)
      .expect(200);

    expect(onLogin).toHaveBeenCalled();
  });

  it('should failed verify token', async () => {
    await query.get(`/auth/verify/fakeuserid/badtoken`).expect(403);

    expect(onLogin).not.toHaveBeenCalled();
  });

  it('should login and logout', async () => {
    await query
      .post('/auth/')
      .set('X-Auth-Host', 'http://localhost:5000/')
      .send({ userEmail: 'test@yopmail' })
      .expect(200);

    const userId = onSendToken.mock.calls[0][0].userId;
    const token = onSendToken.mock.calls[0][0].token;

    await query.get(`/auth/verify/${userId}/${token}`).expect(200);

    await query.get(`/auth/logout/`).expect(200);

    expect(onLogout).toHaveBeenCalled();
  });
});
