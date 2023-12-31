"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.poolPromise = void 0;
const mssql_1 = require("mssql");
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true // if you're on localhost
    }
};
exports.poolPromise = new mssql_1.ConnectionPool(config)
    .connect()
    .then(pool => {
    console.log('Connected to MSSQL');
    return pool;
})
    .catch(err => console.log('Database Connection Failed! Bad Config: ', err));
