import { fetchAllWorkers } from "./workers";

test("loads students past the first 500 records", async () => {
  const first = Array.from({ length: 500 }, (_, id) => ({ id }));
  const api = { get: jest.fn().mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: [{ id: 500 }] }) };
  expect(await fetchAllWorkers(api)).toHaveLength(501);
  expect(api.get).toHaveBeenLastCalledWith("/workers?limit=500&skip=500");
});
