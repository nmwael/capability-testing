# Project Repository: Drools/Quarkus/React Flow

This repository implements a complex rule designer application.

## 🏗️ Architecture Overview

- **Backend:** A Java Quarkus REST API serves as the application's brain, housing the Apache Drools rules engine. It exposes endpoints for state management and rule execution.
- **Frontend:** A React Flow application consumes the REST API to provide a visual, interactive surface for defining, viewing, and manipulating rules and flow diagrams.
- **Integration:** The Frontend communicates with the Backend via HTTP requests.

## 📁 Structure

- `backend/`: Contains the Quarkus/Java code base (Java, Drools implementation).
- `frontend/`: Contains the React Flow application code base (React, TypeScript).
- `rules/`: Contains the initial set of Drools rule definitions (DRL files).

## 🚧 Current State
The project is awaiting the first atomic development task to begin filling out the `backend/` and `frontend/` directories.