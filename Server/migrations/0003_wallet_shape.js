export function up(pgm){pgm.sql("ALTER TABLE vaults ADD CONSTRAINT vaults_wallet_shape CHECK(data ? 'balanceCents' AND jsonb_typeof(data->'balanceCents')='number')");}
export function down(){throw Error('Use a forward migration');}
