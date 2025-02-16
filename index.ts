/*****************************************************
 * rmp-api.ts
 * Fetch ALL professors for a given school, then
 * store them in a JSON file named `professors.json`.
 *****************************************************/

import * as fs from "fs";

const API_LINK = "https://www.ratemyprofessors.com/graphql";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.5",
  "Content-Type": "application/json",
  Authorization: "Basic dGVzdDp0ZXN0",
  "Sec-GPC": "1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  Priority: "u=4",
};

export interface ISchoolSearch {
  cursor: string;
  node: {
    avgRatingRounded: number;
    city: string;
    departments: {
      id: string;
      name: string;
    }[];
    id: string;
    legacyId: number;
    name: string;
    numRatings: number;
    state: string;
    summary: {
      campusConditions: number;
      campusLocation: number;
      careerOpportunities: number;
      clubAndEventActivities: number;
      foodQuality: number;
      internetSpeed: number;
      libraryCondition: number;
      schoolReputation: number;
      schoolSafety: number;
      schoolSatisfaction: number;
      socialActivities: number;
    };
  };
}

export interface ITeacherSearch {
  cursor: string;
  node: {
    __typename: string;
    avgDifficulty: number;
    avgRating: number;
    department: string;
    firstName: string;
    id: string;
    isSaved: boolean;
    lastName: string;
    legacyId: number;
    numRatings: number;
    school: {
      id: string;
      name: string;
    };
    wouldTakeAgainPercent: number;
  };
}

/** 
 * Fetch the first matching school(s) by name. 
 * Returns an array of ISchoolSearch results.
 */
async function searchSchool(
  schoolName: string
): Promise<ISchoolSearch[] | undefined> {
  try {
    const SCHOOL_BODY_QUERY = `\"query NewSearchSchoolsQuery(\\n  $query: SchoolSearchQuery!\\n) {\\n  newSearch {\\n    schools(query: $query) {\\n      edges {\\n        cursor\\n        node {\\n          id\\n          legacyId\\n          name\\n          city\\n          state\\n          departments {\\n            id\\n            name\\n          }\\n          numRatings\\n          avgRatingRounded\\n          summary {\\n            campusCondition\\n            campusLocation\\n            careerOpportunities\\n            clubAndEventActivities\\n            foodQuality\\n            internetSpeed\\n            libraryCondition\\n            schoolReputation\\n            schoolSafety\\n            schoolSatisfaction\\n            socialActivities\\n          }\\n        }\\n      }\\n      pageInfo {\\n        hasNextPage\\n        endCursor\\n      }\\n    }\\n  }\\n}\\n\"`;

    const response = await fetch(API_LINK, {
      credentials: "include",
      headers: HEADERS,
      body: `{"query":${SCHOOL_BODY_QUERY},"variables":{"query":{"text":"${schoolName}"}}}`,
      method: "POST",
      mode: "cors",
    });

    if (!response.ok) {
      throw new Error("Network response from RMP not OK");
    }

    const data = await response.json();
    return data.data.newSearch.schools.edges as ISchoolSearch[];
  } catch (error) {
    console.error(error);
  }
}

/**
 * Fetches ALL professors at a given school (by ID) using pagination.
 * @param professorName  pass "" to retrieve every professor from that school
 * @param schoolId       RMP internal GraphQL ID for the school
 * @returns             list of all teachers for the requested school
 */
async function searchProfessorsAtSchoolId(
  professorName: string,
  schoolId: string
): Promise<ITeacherSearch[]> {
  let allEdges: ITeacherSearch[] = [];
  let endCursor = "";
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query TeacherSearchResultsPageQuery(
        $query: TeacherSearchQuery!
        $schoolID: ID
        $includeSchoolFilter: Boolean!
        $afterCursor: String
      ) {
        search: newSearch {
          teachers(query: $query, first: 50, after: $afterCursor) {
            didFallback
            edges {
              cursor
              node {
                __typename
                avgDifficulty
                avgRating
                department
                firstName
                id
                isSaved
                lastName
                legacyId
                numRatings
                school {
                  id
                  name
                }
                wouldTakeAgainPercent
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
            resultCount
            filters {
              field
              options {
                value
                id
              }
            }
          }
        }
        school: node(id: $schoolID) @include(if: $includeSchoolFilter) {
          __typename
          ... on School {
            name
          }
          id
        }
      }
    `;

    const body = {
      query,
      variables: {
        query: {
          text: professorName,
          schoolID: schoolId,
          fallback: true,
          departmentID: null,
        },
        schoolID: schoolId,
        includeSchoolFilter: true,
        afterCursor: endCursor,
      },
    };

    try {
      const response = await fetch(API_LINK, {
        credentials: "include",
        headers: HEADERS,
        body: JSON.stringify(body),
        method: "POST",
        mode: "cors",
      });

      if (!response.ok) {
        throw new Error("Network response from RMP not OK");
      }

      const data = await response.json();
      const teachers = data.data.search.teachers;
      if (!teachers) {
        console.error("No teachers field found in response. Possibly blocked or invalid ID.");
        break;
      }

      // Accumulate the results
      allEdges = allEdges.concat(teachers.edges);

      // Check for next page
      hasNextPage = teachers.pageInfo.hasNextPage;
      endCursor = teachers.pageInfo.endCursor;
    } catch (error) {
      console.error("Error while fetching teacher data:", error);
      break;
    }
  }

  return allEdges;
}

// MAIN LOGIC
async function main() {
  // 1. SEARCH FOR A SCHOOL BY NAME
  const schoolName = "Santa Cruz California"; // Replace with your school’s name
  const schoolResults = await searchSchool(schoolName);

  if (!schoolResults || schoolResults.length === 0) {
    console.log("No school results found!");
    return;
  }

  // Usually the first is the best match
  const targetSchool = schoolResults[0].node;
  console.log("School found:", targetSchool.name, "ID:", targetSchool.id);

  // 2. RETRIEVE ALL PROFESSORS AT THAT SCHOOL
  const allProfessors = await searchProfessorsAtSchoolId("", targetSchool.id);
  console.log(`Total professors found: ${allProfessors.length}`);

  // 3. SAVE TO A LOCAL FILE AS JSON
  //    We'll just call it "professors.json"
  fs.writeFileSync(
    "professors.json",
    JSON.stringify(allProfessors, null, 2),
    "utf8"
  );
  console.log("Saved all professor data to 'professors.json'.");
}

// RUN!
main();
