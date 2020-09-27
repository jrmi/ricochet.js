import request from 'supertest';
import express from 'express';
import auth from '../authentication';

describe('Authentication test', () => {
  let query;
  let onSendToken;
  let onLogin;
  let onLogout;

  beforeEach(() => {
    onSendToken = jest.fn();
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
    await query.post('/auth/').send({ userEmail: 'test@yopmail' }).expect(200);

    const userHash = onSendToken.mock.calls[0][1];
    const token = onSendToken.mock.calls[0][2];

    const result = await query
      .get(`/auth/verify/${userHash}/${token}`)
      .expect(200);

    expect(onLogin).toHaveBeenCalled();
  });

  it('should failed verify token', async () => {
    await query.get(`/auth/verify/fakeuserhash/badtoken`).expect(403);

    expect(onLogin).not.toHaveBeenCalled();
  });

  it('should login and logout', async () => {
    await query.post('/auth/').send({ userEmail: 'test@yopmail' }).expect(200);

    const token = onSendToken.mock.calls[0][2];
    const userHash = onSendToken.mock.calls[0][1];

    await query.get(`/auth/verify/${userHash}/${token}`).expect(200);

    await query.get(`/auth/logout/`).expect(200);

    expect(onLogout).toHaveBeenCalled();
  });
});
