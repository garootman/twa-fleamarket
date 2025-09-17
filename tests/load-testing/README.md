# Load Testing Documentation

This directory contains Artillery-based load testing configurations for the Telegram Marketplace application.

## Overview

The load testing suite includes multiple test types designed to validate system performance under various conditions:

- **Smoke Test**: Basic functionality verification with minimal load
- **Main Load Test**: Comprehensive testing with realistic user scenarios
- **Spike Test**: Traffic spike testing to verify system resilience
- **Endurance Test**: Long-running tests to identify memory leaks and performance degradation

## Prerequisites

1. **Install Artillery**:
   ```bash
   npm install -g artillery
   ```

2. **Optional: Install jq for enhanced reporting**:
   ```bash
   # On macOS
   brew install jq

   # On Ubuntu/Debian
   sudo apt-get install jq
   ```

3. **Ensure the application is running locally**:
   ```bash
   npm run dev  # Start the development server
   ```

## Quick Start

### Run All Tests
```bash
./run-tests.sh
```

### Run Specific Test Types
```bash
# Smoke test only
./run-tests.sh --test-type smoke

# Main load test
./run-tests.sh --test-type main

# Spike test
./run-tests.sh --test-type spike

# Endurance test
./run-tests.sh --test-type endurance
```

### Test Against Different Environments
```bash
# Test against staging
./run-tests.sh --target https://staging-api.example.com --environment staging

# Test against production (use with caution!)
./run-tests.sh --target https://api.example.com --environment production
```

## Test Configurations

### 1. Smoke Test (`smoke-test.yml`)
- **Duration**: 30 seconds
- **Load**: 1 request/second
- **Purpose**: Verify basic functionality
- **Acceptable Error Rate**: 0%

### 2. Main Load Test (`artillery-config.yml`)
- **Duration**: 5 minutes (multiple phases)
- **Load**: 2-100 requests/second (ramping)
- **Scenarios**:
  - Guest browsing (40%)
  - Authenticated users (35%)
  - Listing creation (15%)
  - Admin operations (5%)
  - Heavy search (5%)
- **Performance Targets**:
  - P95 < 200ms
  - P99 < 500ms
  - Error rate < 5%

### 3. Spike Test (`spike-test.yml`)
- **Duration**: 2.5 minutes
- **Load**: 10-200-10 requests/second
- **Purpose**: Test sudden traffic spikes
- **Acceptable Error Rate**: 10% (during spike)

### 4. Endurance Test (`endurance-test.yml`)
- **Duration**: 10 minutes
- **Load**: 15 requests/second (sustained)
- **Purpose**: Identify memory leaks and long-term stability issues
- **Performance Targets**:
  - P95 < 250ms
  - P99 < 500ms
  - Error rate < 3%

## Test Scenarios

### Guest Browsing (40% of traffic)
- Browse categories
- Search for listings
- View listing details
- Minimal session duration

### Authenticated User Session (35% of traffic)
- Mock authentication via dev endpoint
- Profile management
- Personal listings management
- Authenticated search and browsing

### Listing Creation Workflow (15% of traffic)
- User authentication
- Category selection
- Listing creation with validation
- Viewing created listings

### Admin Operations (5% of traffic)
- Admin authentication
- Moderation operations
- Blocked words management
- System administration tasks

### Heavy Search Activity (5% of traffic)
- Multiple rapid searches
- Category browsing
- High-frequency query patterns

## Understanding Results

### Key Metrics

1. **Response Time**:
   - Mean: Average response time across all requests
   - P95: 95% of requests completed within this time
   - P99: 99% of requests completed within this time

2. **Error Rate**:
   - Percentage of failed requests
   - Should be monitored across different load levels

3. **Throughput**:
   - Requests per second processed
   - Scenarios completed per second

### Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| P95 Response Time | < 200ms | < 500ms |
| P99 Response Time | < 500ms | < 1000ms |
| Error Rate | < 5% | < 10% |
| Availability | > 99% | > 95% |

## Interpreting Reports

### JSON Reports
Artillery generates detailed JSON reports with:
- Request/response statistics
- Error details
- Latency distributions
- Custom metrics

### HTML Reports
Visual reports showing:
- Response time trends
- Error rate over time
- Request volume
- Performance degradation patterns

## Common Issues and Solutions

### High Error Rates
- Check if the target application is running
- Verify database connections
- Monitor resource usage (CPU, memory)
- Check for rate limiting

### High Response Times
- Database query optimization needed
- Caching implementation required
- Infrastructure scaling necessary
- Network latency issues

### Memory Leaks (Endurance Test Failures)
- Monitor application memory usage
- Check for unclosed connections
- Review caching strategies
- Analyze garbage collection patterns

## Customization

### Adding New Scenarios
1. Edit the relevant YAML configuration file
2. Add new scenarios under the `scenarios` section
3. Adjust weights to reflect realistic traffic distribution

### Modifying Load Patterns
1. Update the `phases` section in config files
2. Adjust `arrivalRate` and `duration` parameters
3. Add new phases for specific testing needs

### Environment-Specific Configuration
1. Update the `environments` section
2. Set appropriate target URLs and variables
3. Adjust performance expectations per environment

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run Load Tests
  run: |
    cd tests/load-testing
    ./run-tests.sh --test-type smoke --target ${{ env.STAGING_URL }}
```

### Performance Regression Detection
- Store test results in historical database
- Compare metrics against baseline
- Alert on performance degradation
- Fail builds on critical performance issues

## Monitoring and Alerting

### Real-time Monitoring
- Use Artillery's built-in metrics export
- Integrate with CloudWatch, DataDog, or similar
- Set up dashboards for live performance tracking

### Automated Alerts
- Configure alerts for error rate spikes
- Monitor response time degradation
- Track availability metrics
- Alert on infrastructure resource exhaustion

## Best Practices

1. **Start Small**: Always run smoke tests before full load tests
2. **Gradual Increase**: Use ramping to gradually increase load
3. **Realistic Scenarios**: Base test scenarios on actual user behavior
4. **Environment Parity**: Test in environments similar to production
5. **Regular Testing**: Include load tests in CI/CD pipeline
6. **Monitor Resources**: Watch CPU, memory, and database performance
7. **Document Findings**: Record performance benchmarks and improvements

## Troubleshooting

### Common Error Messages

**"ECONNREFUSED"**: Target application is not running
**"Socket hang up"**: Application crashed or became unresponsive
**"Timeout"**: Requests taking too long, increase timeout or optimize performance
**"Rate limited"**: Too many requests, adjust arrival rate or implement proper rate limiting

### Debug Mode
Run tests with debug output:
```bash
DEBUG=artillery:* ./run-tests.sh --test-type smoke
```

### Verbose Logging
Enable detailed request/response logging:
```bash
artillery run --config artillery-config.yml --target http://localhost:8787 --output results.json -e development -v
```