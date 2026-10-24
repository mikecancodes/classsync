Build ClassSync — AI-Powered Student Dashboard
You are an experienced full-stack web developer and UI/UX designer. Build a modern, responsive, functional website called ClassSync.
ClassSync is an AI-powered student productivity platform designed to combine assignments, announcements, lecture notes, and deadlines from multiple learning management systems (LMS), including D2L Brightspace and Canvas, into one centralized website.
Our goal is to help college students organize their schoolwork, avoid missing deadlines, and use AI to manage their academic workload.
This is a project for a one-day university hackathon. Prioritize a polished, working demonstration over unnecessary complexity.
1. Technology Stack
Use:
React with Vite for the frontend.
Tailwind CSS for styling.
Lucide React for icons.
Local storage to persist user-created data.
A modular architecture that can eventually support a backend, database, and external APIs.
Use JavaScript unless TypeScript is already configured.
Create a working application, not just static mockups.
2. Branding and Design
Website name: ClassSync
Tagline: All your classes. One place.
Design a professional, modern SaaS-style dashboard with:
White and light-gray backgrounds.
Blue and purple accent colors.
Rounded cards with subtle shadows.
Clean typography.
Smooth hover effects and transitions.
Responsive desktop and mobile layouts.
A fixed navigation sidebar on desktop.
A collapsible mobile navigation menu.
Important: The ClassSync logo must feature a BRAIN, not a cloud.
Create a simple brain-shaped logo using an icon or SVG. Position the brain beside the ClassSync name in the upper-left corner.
The brain represents intelligent learning and AI assistance.
3. Website Navigation
Build the following pages with functional navigation.
Page 1: Home
This is the main student dashboard.
At the top, display:
ClassSync brain logo.
Search bar.
Student profile icon.
Sync button to refresh imported assignments.
Include a welcome message such as:
“Good morning! Here’s everything happening with your classes.”
Display three summary cards:
Total Assignments
Due Soon
Completed Assignments
Below the summary cards, display an Announcements section.
Each announcement should include:
Course name
LMS source (D2L or Canvas)
Announcement title
Short description
Date posted
Read/unread status
Sort announcements from newest to oldest.
Include an Upcoming Deadlines section displaying assignments that are due soon.
Page 2: My Assignments
Create a page displaying all assignments from all courses.
Each assignment should have:
Assignment name
Course name
LMS platform
Due date
Priority
Completion status
Estimated completion time
Assignment description
Include filters for:
Course
Due date
LMS platform
Priority
Completed or incomplete
Allow users to mark assignments as completed.
Allow users to manually add, edit, and delete assignments.
Include sorting by nearest deadline.
Page 3: Lecture Notes
Create a lecture notes workspace.
Users should be able to:
Create new notes.
Edit existing notes.
Delete notes.
Assign notes to a course.
Search notes by keyword.
View saved notes.
Use a clean, simple note editor.
Add an AI Summary button to prepare for future AI integration. Only generate actual AI summaries when a working AI service is configured.
Page 4: To-Do List
Create a personal task management page.
Include:
Add Task button
Task name
Optional course association
Due date
Priority
Completion checkbox
Delete task
Divide tasks into:
Today
Upcoming
Completed
Tasks should persist using local storage.
Provide a progress bar showing how many tasks are completed.
Page 5: Calendar
Create an interactive calendar.
Support month and week views if feasible.
Display:
Assignment deadlines
Quizzes
Exams
Personal tasks
Color-code events by course.
Clicking an event should display its details.
Page 6: My Classes
Display all enrolled classes as cards.
Each class should show:
Course name
Instructor (if available)
LMS platform
Number of assignments
Upcoming deadlines
Clicking a class should display its associated assignments and notes.
4. Collapsible ClassSync AI Chatbot
This is one of the most important features.
Create an AI chatbot on the right side of the website.
The chatbot must be accessible from every page.
When expanded, it should appear as a right-side panel containing:
Brain icon
“ClassSync AI” heading
Conversation history
Chat message bubbles
Text input
Send button
Collapse button
When collapsed, display a floating purple button in the bottom-right corner labeled:
“Ask ClassSync AI”
Clicking the button should expand the chatbot.
The chatbot should have access to the application’s current assignment and course data.
Support questions such as:
“What assignments are due tomorrow?”
“What should I work on today?”
“What assignments am I missing?”
“What do I have due this week?”
“Help me organize my study schedule.”
“What assignments do I have for Computer Networks?”
For the hackathon, implement working responses for assignment and deadline questions using the local application data.
If a real AI API is configured, use it to provide more intelligent responses.
If no API is configured, provide clear, useful rule-based responses instead. Do not pretend that a real AI service is connected.
Never expose API keys in frontend code.
5. AI Study Planner
Create a feature called Plan My Week.
When clicked, analyze the student’s incomplete assignments.
Prioritize them based on:
Due date
Assignment priority
Estimated completion time
Remaining workload
Generate a suggested order for completing assignments.
Display the results as an organized daily study plan.
Allow the chatbot to explain why certain assignments should be completed first.
6. D2L and Canvas Integration
The long-term goal is to connect real student accounts from D2L Brightspace and Canvas.
However, because this is a hackathon, start with a realistic demonstration.
Create an integration architecture that supports importing normalized assignment and announcement data from JSON files.
Provide sample data representing multiple courses across D2L and Canvas.
The Sync button should import or refresh sample data and update the dashboard.
Clearly label simulated connections as “Demo” rather than claiming they are live.
Structure the code so that real API integrations can be added later.
Do not attempt to bypass LMS authentication or scrape private student accounts.
7. Sample Data
Populate the website with realistic sample data for these courses:
Computer Networks
Data Structures
Criminal Justice
Computer Architecture
Algorithm Analysis
Include sample assignments such as:
Socket Programming Lab
Priority Queue Assignment
Chapter 5 Quiz
Cache Memory Discussion
Algorithm Analysis Homework
Include multiple announcements, deadlines, and notes.
Use dates relative to the current date so the dashboard continues to work during demonstrations.
8. Functionality Requirements
The following must actually work:
Navigation between pages.
Opening and closing the AI chatbot.
Sending messages to the chatbot.
Displaying assignments and announcements.
Filtering and sorting assignments.
Marking assignments complete.
Adding and deleting personal tasks.
Creating and editing lecture notes.
Generating a study plan.
Refreshing demo LMS data.
Saving user-created data in local storage.
Make sure changes on one page update relevant information on other pages.
For example, completing an assignment should update the Home dashboard’s completed-assignment count.
9. Code Quality
Organize the application into reusable components.
Suggested structure:
src/
components/
Sidebar.jsx
Header.jsx
Chatbot.jsx
AssignmentCard.jsx
AnnouncementCard.jsx
pages/
Home.jsx
Assignments.jsx
LectureNotes.jsx
TodoList.jsx
Calendar.jsx
Classes.jsx
data/
sampleData.js
services/
lmsService.js
studyPlanner.js
App.jsx
main.jsx
Use clean, readable code with helpful comments.
Avoid unnecessary dependencies.
10. Final Requirements
Create a visually impressive, responsive, fully functional frontend.
The website should feel like a real product rather than a basic school assignment.
Prioritize the following in order:
Home dashboard.
My Assignments page.
Collapsible chatbot.
To-Do List.
Lecture Notes.
Calendar.
My Classes.
Advanced AI and LMS integrations.
After building the website:
Explain how to install dependencies.
Explain how to start the development server.
Verify that the application builds successfully.
Identify which features use demo data.
Explain where real D2L, Canvas, and AI API integrations can be added.
