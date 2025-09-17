#!/bin/bash

# Load Testing Runner Script
# Runs different types of load tests using Artillery

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TARGET_URL="http://localhost:8787"
TEST_TYPE="all"
ENVIRONMENT="development"
OUTPUT_DIR="./reports"

# Help function
show_help() {
    echo "Load Testing Runner for Telegram Marketplace"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --target URL       Target URL (default: http://localhost:8787)"
    echo "  -e, --environment ENV  Environment: development, staging, production (default: development)"
    echo "  -s, --test-type TYPE   Test type: smoke, main, spike, endurance, all (default: all)"
    echo "  -o, --output DIR       Output directory for reports (default: ./reports)"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --test-type smoke                    # Run only smoke tests"
    echo "  $0 --target https://api.example.com     # Test against specific URL"
    echo "  $0 --environment staging                # Use staging configuration"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--target)
            TARGET_URL="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -s|--test-type)
            TEST_TYPE="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Check if Artillery is installed
if ! command -v artillery &> /dev/null; then
    echo -e "${RED}Error: Artillery is not installed${NC}"
    echo "Install it with: npm install -g artillery"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Get timestamp for report names
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo -e "${BLUE}🎯 Telegram Marketplace Load Testing${NC}"
echo -e "${BLUE}Target: ${TARGET_URL}${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Test Type: ${TEST_TYPE}${NC}"
echo -e "${BLUE}Output Directory: ${OUTPUT_DIR}${NC}"
echo ""

# Function to run a specific test
run_test() {
    local test_name=$1
    local config_file=$2
    local description=$3

    echo -e "${YELLOW}🚀 Starting ${test_name}...${NC}"
    echo -e "${BLUE}Description: ${description}${NC}"

    local report_file="${OUTPUT_DIR}/${test_name}_${TIMESTAMP}.json"
    local html_report="${OUTPUT_DIR}/${test_name}_${TIMESTAMP}.html"

    # Run Artillery test with JSON and HTML reports
    if artillery run \
        --target "$TARGET_URL" \
        --environment "$ENVIRONMENT" \
        --output "$report_file" \
        "$config_file"; then

        echo -e "${GREEN}✅ ${test_name} completed successfully${NC}"

        # Generate HTML report if possible
        if command -v artillery report &> /dev/null; then
            artillery report --output "$html_report" "$report_file"
            echo -e "${GREEN}📊 HTML report: ${html_report}${NC}"
        fi

        # Show basic stats
        echo -e "${BLUE}📈 Basic Stats:${NC}"
        if command -v jq &> /dev/null; then
            jq -r '.aggregate | "Scenarios: \(.scenariosCompleted // 0), Requests: \(.requestsCompleted // 0), Errors: \(.errors // 0)"' "$report_file" 2>/dev/null || echo "Stats parsing failed"
        fi

        echo ""
        return 0
    else
        echo -e "${RED}❌ ${test_name} failed${NC}"
        echo ""
        return 1
    fi
}

# Test execution based on type
case $TEST_TYPE in
    "smoke")
        run_test "smoke-test" "smoke-test.yml" "Quick functionality verification"
        ;;
    "main")
        run_test "main-load-test" "artillery-config.yml" "Main load testing with realistic user scenarios"
        ;;
    "spike")
        run_test "spike-test" "spike-test.yml" "Traffic spike testing"
        ;;
    "endurance")
        run_test "endurance-test" "endurance-test.yml" "Long-running endurance testing"
        ;;
    "all")
        echo -e "${YELLOW}🎯 Running complete test suite...${NC}"

        # Run tests in sequence
        run_test "smoke-test" "smoke-test.yml" "Quick functionality verification"

        if [ $? -eq 0 ]; then
            run_test "main-load-test" "artillery-config.yml" "Main load testing with realistic user scenarios"
        else
            echo -e "${RED}Skipping further tests due to smoke test failure${NC}"
            exit 1
        fi

        run_test "spike-test" "spike-test.yml" "Traffic spike testing"
        run_test "endurance-test" "endurance-test.yml" "Long-running endurance testing"
        ;;
    *)
        echo -e "${RED}Invalid test type: $TEST_TYPE${NC}"
        echo "Valid types: smoke, main, spike, endurance, all"
        exit 1
        ;;
esac

echo -e "${GREEN}🎉 Load testing completed!${NC}"
echo -e "${BLUE}Reports saved to: ${OUTPUT_DIR}${NC}"

# Generate summary if all tests were run
if [ "$TEST_TYPE" = "all" ]; then
    echo -e "${YELLOW}📊 Generating test summary...${NC}"

    SUMMARY_FILE="${OUTPUT_DIR}/summary_${TIMESTAMP}.txt"

    {
        echo "=== Telegram Marketplace Load Test Summary ==="
        echo "Timestamp: $(date)"
        echo "Target: $TARGET_URL"
        echo "Environment: $ENVIRONMENT"
        echo ""

        for report in "${OUTPUT_DIR}"/*_"${TIMESTAMP}".json; do
            if [ -f "$report" ]; then
                echo "=== $(basename "$report" .json) ==="
                if command -v jq &> /dev/null; then
                    jq -r '
                        .aggregate |
                        "Scenarios Completed: \(.scenariosCompleted // 0)",
                        "Requests Completed: \(.requestsCompleted // 0)",
                        "Errors: \(.errors // 0)",
                        "Mean Response Time: \(.latency.mean // 0)ms",
                        "P95 Response Time: \(.latency.p95 // 0)ms",
                        "P99 Response Time: \(.latency.p99 // 0)ms"
                    ' "$report" 2>/dev/null || echo "Failed to parse $report"
                else
                    echo "jq not available for detailed stats"
                fi
                echo ""
            fi
        done
    } > "$SUMMARY_FILE"

    echo -e "${GREEN}📋 Summary saved to: ${SUMMARY_FILE}${NC}"

    # Display summary
    cat "$SUMMARY_FILE"
fi