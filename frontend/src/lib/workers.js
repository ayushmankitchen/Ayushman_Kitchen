export async function fetchAllWorkers(api) {
  const workers = [];
  const limit = 500;
  for (let skip = 0; ; skip += limit) {
    const { data } = await api.get(`/workers?limit=${limit}&skip=${skip}`);
    workers.push(...data);
    if (data.length < limit) return workers;
  }
}
