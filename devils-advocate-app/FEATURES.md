# Devil's Advocate - Feature Roadmap & Checklist

This document tracks the comprehensive list of features requested for the Devil's Advocate platform.

## 1. Authentication & Security
- [x] **Google Login:** Implemented using Firebase Authentication.
- [ ] **Backend Token Verification:** Ensure all protected routes verify the Firebase token.
- [ ] **User Tracking:** Log and store authenticated users in the backend.

## 2. Debate Customization
- [x] **Debate Intensity Slider:** Allows users to control how aggressive the AI argues (Friendly 🟢, Challenging 🟡, Devil mode 🔴).
- [ ] **AI Persona Selection:** Let users select who the AI acts as (Devil's Advocate, Philosopher, Scientist, Politician, Lawyer, etc.).

## 3. Pre-Debate Features
- [x] **Topic Generator:** "Give me a controversial topic" button.

## 4. In-Debate Analysis
- [x] **Debate Score System:** AI scores user arguments based on Logic, Evidence, and Persuasiveness.
- [x] **Logical Fallacy Detector:** AI detects Strawman, Ad hominem, False dilemma, etc., and flags them.
- [x] **Sentiment & Emotion Analysis:** Analyzes whether arguments are angry, positive, neutral, etc.
- [ ] **Argument Quality Scoring (NLP):** Deep NLP-based metrics for consistency, evidence, and clarity.

## 5. Post-Debate & History
- [x] **Debate Summary:** AI provides the best arguments and overall conclusion when ending a debate.
- [x] **Save Debate History:** Store past debates, topics, and scores in Firebase for users to revisit.
- [ ] **Debate Difficulty Rating:** Rate topics based on how hard they are to debate.

## 6. Community & Gamification
- [ ] **Leaderboard:** Display top debaters of the week based on scores.
- [ ] **Public Debate Mode:** Two humans debate while the AI moderates, times, and judges.
- [ ] **Trending Topics Dashboard:** Track and display which topics are debated most.
- [ ] **User Debate Style Clustering:** Cluster users based on styles (emotional, logical, aggressive) and show on their profile.

## 7. Platform Analytics (Backend/Admin)
- [ ] **Global User Stats:** View data on individual and average platform scores.
- [ ] **AI Improvement Feedback Loop:** Analyze which AI arguments win/fail to improve prompts.
- [ ] **Admin Dashboard:** Track total debates, controversy levels, average scores, and sentiment distribution.

## 8. Safety, Abuse Prevention & Stability
- [ ] **Toxicity Detection:** Classifier to block hate speech and harassment, storing toxic users' data in the backend.
- [ ] **Rate Limiting:** Limit requests per user (e.g., 10 msgs/min, 50 debates/day) to prevent API spam and cost spikes.
- [ ] **Prevent Prompt Abuse:** Jailbreak filters and content moderation.

## 9. Infrastructure Security Checklist
- [x] **API Keys Hidden:** Ensure sensitive keys aren't exposed.
- [x] **CORS restricted:** Only allow requests from the designated frontend.
- [ ] **Database Rules Configured:** Users can only access their own data in Firebase.
- [ ] **Logging & Monitoring:** Track requests, errors, and potential attacks.
- [ ] **HTTPS Enabled:** For production deployment.
