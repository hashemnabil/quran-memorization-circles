import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
export class UpdatePendingReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000)
  reason: string;
  @ValidateIf((_object, value) => value !== null) @IsString() @MaxLength(1000)
  previousReason: string | null;
}
