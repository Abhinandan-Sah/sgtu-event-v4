// Central export for all models - Production-ready flat structure
import StudentModel from './Student.model.js';
import VolunteerModel from './Volunteer.model.js';
import AdminModel from './Admin.model.js';
import SchoolModel from './School.model.js';
import StallModel from './Stall.model.js';
import FeedbackModel from './Feedback.model.js';
import RankingModel from './Ranking.model.js';
import CheckInOutModel from './CheckInOut.model.js';
import EventManagerModel from './EventManager.model.js';
import EventModel from './Event.model.js';
import EventRegistrationModel from './EventRegistration.model.js';
import EventVolunteerModel from './EventVolunteer.model.js';
import StudentEventRankingModel from './StudentEventRanking.model.js';

// Named exports (preferred for production - tree-shaking support)
export {
  StudentModel,
  VolunteerModel,
  AdminModel,
  SchoolModel,
  StallModel,
  FeedbackModel,
  RankingModel,
  CheckInOutModel,
  EventManagerModel,
  EventModel,
  EventRegistrationModel,
  EventVolunteerModel,
  StudentEventRankingModel
};
