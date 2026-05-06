import { request } from "./auth";
import { API_BASE } from "./auth";

const llm_endpoint = "/llm";


export const sendMessage = async (input: string) => {
  const data = await request(`${llm_endpoint}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_input: input })
  })
  return data
}


export const gen_test_data = async (schema: Record<string, any>) => {
  const data = await request(`${llm_endpoint}/generate-test-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schema })
  })
  return data
}

export const gen_tests = async (endpoints: { method: string; path: string; file: string }[]) => {
  const data = await request(`${llm_endpoint}/generate-tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoints })
  })
  return data
}