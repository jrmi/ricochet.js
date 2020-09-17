import request from "supertest";
import app from "../index.js";

describe("Store Test", () => {
  it("should test get status code is 200", async (done) => {
    const res = await request(app).get("/store/myboxid/");
    expect(res.statusCode).toEqual(200);
    done();
  });
});
