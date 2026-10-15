"""
A2A (Agent-to-Agent) Interoperability Bridge.
Facilitates standardized message passing between CrewAI and ADK agents (Requirement #6 & #7).
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Callable, Optional
from src.schemas.models import A2AMessage, AgentFramework
from src.blackboard.engine import HoverBlackboard, get_blackboard


class A2ABridge:
    """
    Message router enabling cross-framework interoperability between CrewAI and ADK agents.
    """

    def __init__(self, blackboard: Optional[HoverBlackboard] = None):
        self.blackboard = blackboard or get_blackboard()
        self._handlers: Dict[str, Callable[[A2AMessage], Any]] = {}

    def register_agent_handler(self, agent_name: str, handler: Callable[[A2AMessage], Any]) -> None:
        """Register an agent's receiver hook."""
        self._handlers[agent_name] = handler

    def send_message(
        self,
        sender_agent: str,
        sender_framework: AgentFramework,
        receiver_agent: str,
        receiver_framework: AgentFramework,
        intent: str,
        payload: Dict[str, Any],
        correlation_id: str,
    ) -> A2AMessage:
        """
        Deliver message to receiver and record transaction on the Hover Blackboard.
        """
        msg = A2AMessage(
            message_id=f"msg_{uuid.uuid4().hex[:8]}",
            timestamp=datetime.utcnow(),
            sender_agent=sender_agent,
            sender_framework=sender_framework,
            receiver_agent=receiver_agent,
            receiver_framework=receiver_framework,
            intent=intent,
            correlation_id=correlation_id,
            payload=payload,
        )

        # Log on Blackboard
        self.blackboard.post_a2a_event(msg)
        self.blackboard.log_trace(
            agent_name=sender_agent,
            framework=sender_framework,
            action=f"A2A_SEND_{intent}",
            details={"to": receiver_agent, "framework": receiver_framework, "msg_id": msg.message_id},
        )

        # Dispatch to registered receiver handler if available
        if receiver_agent in self._handlers:
            self._handlers[receiver_agent](msg)

        return msg
