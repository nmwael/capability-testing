> # 🚀 DEVELOPMENT Guide

    ## 📚 Repository Overview
    This repository uses a Quarkus + React modulith architecture, providing a robust framework for software development and LLM orchestration.
    
    The structure includes:
    - `backend/`: Java/Maven services for the core API logic.
    - `frontend/`: The client interface built with React and TypeScript.
    - `capabilities/`: The capability registry.
    - `models/`: Storage for LLM weights (e.g., GGUF).
    - `scripts/`: Operational scripts for service management and validation.

    ## 🛠️ Initial Setup
    Before starting development, ensure all prerequisites are met.
    
    ### 1. Dependency Validation
    Run the capability validation check to ensure structural integrity:
    
    ```bash
    node scripts/verify-capabilities.js
    ```
    
    ## 💻 Frontend Development (React/Vite)
    The frontend uses React and TypeScript.
    
    ### Development Workflow
    1.  **Run Tests/Check Dependencies**: Use the following command in the `frontend/` directory to validate the build:
        ```bash
        npm run typecheck && npx depcruise src --config .depcruiser.js
        ```
    2.  **Build**: Compile the application for production:
        ```bash
        npm run build
        ```
    
    ## ⚙️ Backend Development (Java/Maven)
    The backend services are built using Maven.
    
    ### Development Workflow
    To build and test the backend services, navigate to the `backend/` directory and execute:
    
    ```bash
    mvn -B test
    ```