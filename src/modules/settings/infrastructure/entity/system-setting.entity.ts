import { Column, Entity, PrimaryColumn } from 'typeorm';

export type SystemSettingValue = boolean | { enabled?: boolean };

@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: SystemSettingValue;
}
