export function up(pgm){pgm.sql('CREATE TABLE avatar_deletions(profile_id text PRIMARY KEY,created timestamptz NOT NULL DEFAULT now())');}
export function down(){throw Error('Use a forward migration');}
