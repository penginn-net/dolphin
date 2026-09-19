import {MigrationInterface, QueryRunner} from "typeorm";

export class driveFileColdStorage1725840000000 implements MigrationInterface {
    name = 'driveFileColdStorage1725840000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "drive_file" ADD "storedInColdStorage" boolean NOT NULL DEFAULT false`, undefined);
        await queryRunner.query(`COMMENT ON COLUMN "drive_file"."storedInColdStorage" IS 'Whether the DriveFile is stored in the cold object storage.'`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_9d1b1b1f0a41d0b62b1f0e1a7c" ON "drive_file" ("storedInColdStorage") `, undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_9d1b1b1f0a41d0b62b1f0e1a7c"`, undefined);
        await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "storedInColdStorage"`, undefined);
    }

}
