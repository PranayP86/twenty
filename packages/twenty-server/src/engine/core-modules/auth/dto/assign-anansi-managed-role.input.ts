import { IsEmail, IsLowercase, IsUUID, MaxLength } from 'class-validator';

export class AssignAnansiManagedRoleInput {
  @IsUUID()
  workspaceId!: string;

  @IsEmail()
  @IsLowercase()
  @MaxLength(320)
  targetEmail!: string;

  @IsUUID()
  memberRoleId!: string;
}
