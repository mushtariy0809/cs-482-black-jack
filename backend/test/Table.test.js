const test = require('node:test');
const assert = require('node:assert/strict');
const Table = require('../models/Table.js');

test('Table model is registered with correct modelName', () => {
  assert.equal(Table.modelName, 'Table');
});

test('schema enables timestamps (createdAt and updatedAt)', () => {
  assert.equal(Table.schema.options.timestamps, true);
  assert.ok(Table.schema.path('createdAt'));
  assert.ok(Table.schema.path('updatedAt'));
});

test('validates successfully with minimal required fields and applies defaults', async () => {
  const table = new Table({
    _id: 'table-alpha-1',
    name: 'Main Casino Table',
    inviteCode: 'INV-001',
  });

  await assert.doesNotReject(async () => {
    await table.validate();
  });

  assert.equal(table._id, 'table-alpha-1');
  assert.equal(table.name, 'Main Casino Table');
  assert.equal(table.inviteCode, 'INV-001');
  assert.equal(table.visibility, 'public');
  assert.equal(table.passwordHash, null);
  assert.equal(table.mode, 'people');
  assert.equal(table.solo, false);
  assert.equal(table.maxSeats, 5);
  assert.deepEqual(table.seats, []);
  assert.equal(table.minBet, 10);
  assert.equal(table.maxBet, 500);
  assert.equal(table.status, 'waiting');
  assert.equal(table.createdBy, null);
  assert.equal(table.isSystem, false);
  assert.equal(table.emptySince, null);
});

test('trims whitespace from table name', () => {
  const table = new Table({
    _id: 'table-trim',
    name: '   High Stakes VIP   ',
    inviteCode: 'INV-TRIM',
  });

  assert.equal(table.name, 'High Stakes VIP');
});

test('validates all allowed enum values for visibility, mode, and status', async () => {
  const visibilities = ['public', 'private'];
  const modes = ['people', 'bots'];
  const statuses = ['waiting', 'in_game', 'full'];

  for (const visibility of visibilities) {
    for (const mode of modes) {
      for (const status of statuses) {
        const table = new Table({
          _id: `tbl-${visibility}-${mode}-${status}`,
          name: 'Dynamic Table',
          inviteCode: `INV-${visibility}-${mode}-${status}`,
          visibility,
          mode,
          status,
        });

        await assert.doesNotReject(async () => {
          await table.validate();
        });
      }
    }
  }
});

test('rejects document when required fields are missing', async () => {
  const emptyTable = new Table({});

  await assert.rejects(
    async () => {
      await emptyTable.validate();
    },
    (err) => {
      assert.equal(err.name, 'ValidationError');
      assert.ok(err.errors._id, '_id should be required');
      assert.ok(err.errors.name, 'name should be required');
      assert.ok(err.errors.inviteCode, 'inviteCode should be required');
      return true;
    }
  );
});

test('rejects missing _id', async () => {
  const table = new Table({
    name: 'Table No ID',
    inviteCode: 'INV-NO-ID',
  });

  await assert.rejects(
    async () => {
      await table.validate();
    },
    (err) => {
      assert.ok(err.errors._id);
      return true;
    }
  );
});

test('rejects missing name', async () => {
  const table = new Table({
    _id: 'table-no-name',
    inviteCode: 'INV-NO-NAME',
  });

  await assert.rejects(
    async () => {
      await table.validate();
    },
    (err) => {
      assert.ok(err.errors.name);
      return true;
    }
  );
});

test('rejects missing inviteCode', async () => {
  const table = new Table({
    _id: 'table-no-invite',
    name: 'Table Without Invite',
  });

  await assert.rejects(
    async () => {
      await table.validate();
    },
    (err) => {
      assert.ok(err.errors.inviteCode);
      return true;
    }
  );
});

test('rejects invalid enum values for visibility, mode, and status', async () => {
  const invalidVisibility = new Table({
    _id: 'tbl-bad-vis',
    name: 'Bad Vis',
    inviteCode: 'INV-BAD-VIS',
    visibility: 'unlisted',
  });

  await assert.rejects(
    async () => {
      await invalidVisibility.validate();
    },
    (err) => {
      assert.ok(err.errors.visibility);
      assert.equal(err.errors.visibility.kind, 'enum');
      return true;
    }
  );

  const invalidMode = new Table({
    _id: 'tbl-bad-mode',
    name: 'Bad Mode',
    inviteCode: 'INV-BAD-MODE',
    mode: 'ai_supercomputers',
  });

  await assert.rejects(
    async () => {
      await invalidMode.validate();
    },
    (err) => {
      assert.ok(err.errors.mode);
      assert.equal(err.errors.mode.kind, 'enum');
      return true;
    }
  );

  const invalidStatus = new Table({
    _id: 'tbl-bad-status',
    name: 'Bad Status',
    inviteCode: 'INV-BAD-STATUS',
    status: 'archived',
  });

  await assert.rejects(
    async () => {
      await invalidStatus.validate();
    },
    (err) => {
      assert.ok(err.errors.status);
      assert.equal(err.errors.status.kind, 'enum');
      return true;
    }
  );
});

test('validates seats subdocument with default values and no subdocument _id', async () => {
  const table = new Table({
    _id: 'tbl-seats-1',
    name: 'Seats Table',
    inviteCode: 'INV-SEATS-1',
    seats: [
      {
        index: 0,
        clientId: 'client-abc-123',
      },
    ],
  });

  await assert.doesNotReject(async () => {
    await table.validate();
  });

  const seat = table.seats[0];
  assert.equal(seat.index, 0);
  assert.equal(seat.clientId, 'client-abc-123');
  assert.equal(seat.name, 'Guest');
  assert.equal(seat.inHand, false);
  assert.equal(seat.reservedUntil, null);
  assert.equal(seat._id, undefined, 'Seat subdocument should not have an _id');
});

test('accepts custom seat values including reservedUntil timestamp', async () => {
  const reservationTime = new Date('2026-11-06T15:00:00Z');
  const table = new Table({
    _id: 'tbl-seats-2',
    name: 'Active Table',
    inviteCode: 'INV-SEATS-2',
    seats: [
      {
        index: 2,
        clientId: 'player-xyz',
        name: 'Carlos',
        inHand: true,
        reservedUntil: reservationTime,
      },
    ],
  });

  await assert.doesNotReject(async () => {
    await table.validate();
  });

  const seat = table.seats[0];
  assert.equal(seat.index, 2);
  assert.equal(seat.clientId, 'player-xyz');
  assert.equal(seat.name, 'Carlos');
  assert.equal(seat.inHand, true);
  assert.equal(seat.reservedUntil.toISOString(), reservationTime.toISOString());
});

test('rejects seat with missing required fields (index or clientId)', async () => {
  const tableMissingIndex = new Table({
    _id: 'tbl-bad-seat-1',
    name: 'Bad Seat',
    inviteCode: 'INV-BAD-SEAT-1',
    seats: [
      { clientId: 'client-only' },
    ],
  });

  await assert.rejects(
    async () => {
      await tableMissingIndex.validate();
    },
    (err) => {
      assert.ok(err.errors['seats.0.index']);
      return true;
    }
  );

  const tableMissingClientId = new Table({
    _id: 'tbl-bad-seat-2',
    name: 'Bad Seat',
    inviteCode: 'INV-BAD-SEAT-2',
    seats: [
      { index: 1 },
    ],
  });

  await assert.rejects(
    async () => {
      await tableMissingClientId.validate();
    },
    (err) => {
      assert.ok(err.errors['seats.0.clientId']);
      return true;
    }
  );
});

test('verifies custom configuration values and inviteCode unique index', async () => {
  const emptyDate = new Date();
  const table = new Table({
    _id: 'tbl-full-custom',
    name: 'Custom High Stakes',
    inviteCode: 'INV-CUSTOM',
    passwordHash: 'hashed_secret_pw',
    solo: true,
    maxSeats: 7,
    minBet: 100,
    maxBet: 5000,
    createdBy: 'admin-user-01',
    isSystem: true,
    emptySince: emptyDate,
  });

  await assert.doesNotReject(async () => {
    await table.validate();
  });

  assert.equal(table.passwordHash, 'hashed_secret_pw');
  assert.equal(table.solo, true);
  assert.equal(table.maxSeats, 7);
  assert.equal(table.minBet, 100);
  assert.equal(table.maxBet, 5000);
  assert.equal(table.createdBy, 'admin-user-01');
  assert.equal(table.isSystem, true);
  assert.equal(table.emptySince.getTime(), emptyDate.getTime());
  assert.equal(Table.schema.path('inviteCode').options.unique, true);
});
