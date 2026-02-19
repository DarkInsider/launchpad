import knexLib from 'knex';
import config from '../knexfile.mjs';

const db = knexLib(config);

export default db;

