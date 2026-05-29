async function test() {
  try {
    const res = await fetch('http://localhost:5000/api/v1/dashboard/all-staff-stats?date=' + new Date().toISOString().split('T')[0]);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch(e) {
    console.error(e);
  }
}
test();
