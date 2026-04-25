cmake_minimum_required(VERSION 3.16)
project(portfolio_site LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(iouring_runtime_web CONFIG REQUIRED)

add_executable(portfolio_site src/main.cpp)
target_link_libraries(portfolio_site PRIVATE iouring_runtime_web::RuntimeWeb)
target_compile_options(portfolio_site PRIVATE -Wall -Wextra -Wpedantic)
