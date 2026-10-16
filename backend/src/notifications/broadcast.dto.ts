import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
export class BroadcastDto {
  @IsString() @IsNotEmpty() @MaxLength(160) title: string;
  @IsString() @IsNotEmpty() @MaxLength(3000) body: string;
  @IsIn(['TEACHER', 'STUDENT', 'ALL']) audience: 'TEACHER' | 'STUDENT' | 'ALL';
  @IsIn(['ALL', 'SELECTED']) selection: 'ALL' | 'SELECTED';
  @IsArray() @ArrayMaxSize(5000) @ArrayUnique() @IsUUID('4', { each: true }) userIds: string[];
}
