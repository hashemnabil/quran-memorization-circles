import { Module } from '@nestjs/common';
import { MediaActivitiesController } from './media-activities.controller';
import { MediaActivitiesService } from './media-activities.service';

@Module({ controllers: [MediaActivitiesController], providers: [MediaActivitiesService] })
export class MediaActivitiesModule {}
