const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.company.findMany({ orderBy: { id: 'asc' } })
  .then((rows) => console.log(JSON.stringify(rows, null, 2)))
  .finally(() => p.$disconnect());
