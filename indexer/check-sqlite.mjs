import Database from 'better-sqlite3'
const d = new Database(':memory:')
d.exec('create table t(x int); insert into t values (1)')
console.log('sqlite ok', d.prepare('select x from t').get())
